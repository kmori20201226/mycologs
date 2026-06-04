import { FastifyInstance } from 'fastify'

// GSI (Geospatial Information Authority of Japan) address-search endpoint.
// Overridable via env so tests can point at a stub.
const GSI_URL = process.env.GSI_GEOCODE_URL ?? 'https://msearch.gsi.go.jp/address-search/AddressSearch'

export default async function (fastify: FastifyInstance) {
    fastify.post('/ai/geocode', {
        preHandler: [fastify.authenticate],
        schema: {
            body: {
                type: 'object',
                required: ['place'],
                properties: {
                    place: { type: 'string' }
                }
            },
            response: {
                200: {
                    type: 'object',
                    properties: {
                        candidates: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    name:      { type: 'string' },
                                    longitude: { type: 'number' },
                                    latitude:  { type: 'number' }
                                }
                            }
                        }
                    }
                }
            }
        }
    }, async (request, reply) => {
        const { place } = request.body as { place: string }

        const response = await fetch(`${GSI_URL}?q=${encodeURIComponent(place)}`)

        if (!response.ok) {
            return reply.code(502 as any).send({ message: '住所検索サービスへの接続に失敗しました。' })
        }

        const features = await response.json() as Array<{
            geometry: { coordinates: [number, number] }
            properties: { title: string }
        }>

        const candidates = features.map((f) => ({
            name:      f.properties.title,
            longitude: f.geometry.coordinates[0],
            latitude:  f.geometry.coordinates[1],
        }))

        return reply.send({ candidates })
    })
}
