import { apiClient } from '@/lib/api';

interface Shape {
  id: number;
  name: string;
}

interface Family {
  id: number;
  name: string;
  shapeId: number;
}

interface Genus {
  id: number;
  name: string;
  familyId: number;
}

interface Species {
  id: number;
  name: string;
  genusId: number;
}

async function getTaxonomyData() {
  try {
    const [shapes, families, genera, species] = await Promise.all([
      apiClient.getShapes(),
      apiClient.getFamilies(),
      apiClient.getGenera(),
      apiClient.getSpecies(),
    ]);

    return { shapes, families, genera, species };
  } catch (error) {
    console.error('Failed to fetch taxonomy data:', error);
    return { shapes: [], families: [], genera: [], species: [] };
  }
}

export default async function TaxonomyPage() {
  const { shapes, families, genera, species } = await getTaxonomyData();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Field Guide</h1>
          <p className="text-xl text-gray-600">
            Explore the mushroom classification hierarchy
          </p>
        </div>

        <div className="grid gap-8">
          {/* Shapes */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-emerald-700">🍄 Shapes</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {shapes.map((shape) => (
                <div key={shape.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                  <h3 className="font-semibold text-lg">{shape.name}</h3>
                  <p className="text-gray-600 text-sm">
                    {families.filter(f => f.shapeId === shape.id).length} families
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Families */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-emerald-700">🌿 Families</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {families.map((family) => {
                const shape = shapes.find(s => s.id === family.shapeId);
                return (
                  <div key={family.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                    <h3 className="font-semibold">{family.name}</h3>
                    <p className="text-gray-600 text-sm">
                      Shape: {shape?.name || 'Unknown'}
                    </p>
                    <p className="text-gray-600 text-sm">
                      {genera.filter(g => g.familyId === family.id).length} genera
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Genera */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-emerald-700">🌱 Genera</h2>
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
              {genera.map((genus) => {
                const family = families.find(f => f.id === genus.familyId);
                return (
                  <div key={genus.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                    <h3 className="font-semibold">{genus.name}</h3>
                    <p className="text-gray-600 text-sm">
                      Family: {family?.name || 'Unknown'}
                    </p>
                    <p className="text-gray-600 text-sm">
                      {species.filter(s => s.genusId === genus.id).length} species
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Species */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-emerald-700">🍄 Species</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {species.map((specie) => {
                const genus = genera.find(g => g.id === specie.genusId);
                const family = genus ? families.find(f => f.id === genus.familyId) : null;
                const shape = family ? shapes.find(s => s.id === family.shapeId) : null;

                return (
                  <div key={specie.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                    <h3 className="font-semibold text-lg">{specie.name}</h3>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>Genus: {genus?.name || 'Unknown'}</p>
                      <p>Family: {family?.name || 'Unknown'}</p>
                      <p>Shape: {shape?.name || 'Unknown'}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {shapes.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🌱</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No taxonomy data yet</h3>
            <p className="text-gray-600">The field guide is being populated with mushroom classifications.</p>
          </div>
        )}
      </div>
    </div>
  );
}