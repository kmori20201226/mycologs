import time
import requests

API = "https://api.inaturalist.org/v1"
HEADERS = {"User-Agent": "mycologs/1.0 (https://github.com/mycologs)"}

COMMERCIAL_LICENSES = ["cc0", "cc-by", "cc-by-sa", "cc-by-nd"]
SIZES = ["square", "small", "medium", "large", "original"]
SLEEP = 1.1  # stay under 60 req/min
SLEEP_DOWNLOAD = 0.3


def _get(path: str, params: dict) -> dict:
    r = requests.get(f"{API}{path}", params=params, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()


def fetch_species_in_japan(max_results: int = 500) -> list[dict]:
    """Return species_counts results for Fungi observed in Japan, sorted by count desc."""
    per_page = min(max_results, 500)
    data = _get(
        "/observations/species_counts",
        {"place_id": 6737, "iconic_taxa": "Fungi", "order_by": "observations_count",
         "order": "desc", "per_page": per_page},
    )
    return data.get("results", [])


def fetch_commercial_photo_count(taxon_id: int) -> int:
    """Return number of observations with commercially-usable photos for a taxon (globally)."""
    data = _get(
        "/observations",
        {"taxon_id": taxon_id, "photo_license": ",".join(COMMERCIAL_LICENSES), "per_page": 0},
    )
    time.sleep(SLEEP)
    return data.get("total_results", 0)


def _sized_url(square_url: str, size: str) -> str:
    if not square_url:
        return ""
    return square_url.replace("/square.", f"/{size}.")


def _fetch_photos_page(taxon_id: int, size: str, max_photos: int,
                        seen_ids: set, place_id: int | None = None) -> list[dict]:
    photos: list[dict] = []
    page = 1
    while len(photos) < max_photos:
        params: dict = {
            "taxon_id": taxon_id,
            "photo_license": ",".join(COMMERCIAL_LICENSES),
            "per_page": 100,
            "page": page,
        }
        if place_id is not None:
            params["place_id"] = place_id
        data = _get("/observations", params)
        observations = data.get("results", [])
        if not observations:
            break
        for obs in observations:
            for photo in obs.get("photos", []):
                photo_id = photo.get("id")
                if photo_id in seen_ids:
                    continue
                license_code = photo.get("license_code", "")
                if license_code not in COMMERCIAL_LICENSES:
                    continue
                square = photo.get("url", "")
                user = obs.get("user", {})
                coords = obs.get("location", "")
                lat, lng = ("", "")
                if coords and "," in coords:
                    lat, lng = coords.split(",", 1)
                seen_ids.add(photo_id)
                photos.append({
                    "photo_id": photo_id,
                    "license": license_code,
                    "attribution": photo.get("attribution", ""),
                    "photographer": user.get("name") or user.get("login", ""),
                    "observed_on": obs.get("observed_on", ""),
                    "time_observed_at": obs.get("time_observed_at", ""),
                    "place_guess": obs.get("place_guess", ""),
                    "latitude": lat.strip(),
                    "longitude": lng.strip(),
                    "observation_id": obs.get("id"),
                    "url": _sized_url(square, size),
                })
                if len(photos) >= max_photos:
                    break
            if len(photos) >= max_photos:
                break
        page += 1
        time.sleep(SLEEP)
    return photos


def fetch_photos(taxon_id: int, size: str, max_photos: int) -> list[dict]:
    """Fetch commercially-usable photos, Japan observations first, then global to fill quota."""
    seen_ids: set = set()
    photos = _fetch_photos_page(taxon_id, size, max_photos, seen_ids, place_id=6737)
    if len(photos) < max_photos:
        remaining = max_photos - len(photos)
        photos += _fetch_photos_page(taxon_id, size, remaining, seen_ids, place_id=None)
    return photos
