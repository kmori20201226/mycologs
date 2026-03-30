const edibilityEnum = ['EDIBLE', 'INEDIBLE', 'TOXIC', 'DEADLY', 'UNKNOWN']

export const speciesSchema = {
    type: 'object',
    properties: {
        id: { type: 'number' },
        scientificName: { type: 'string' },
        japaneseName: { type: 'string', nullable: true },
        gbifTaxonKey: { type: 'number', nullable: true },
        edibility: { type: 'string', enum: edibilityEnum, nullable: true },
        genusId: { type: 'number' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        deletedAt: { type: 'string', format: 'date-time', nullable: true },
        genus: {
            type: 'object',
            properties: {
                id: { type: 'number' },
                scientificName: { type: 'string' },
                japaneseName: { type: 'string', nullable: true }
            }
        }
    }
}

export const createSpeciesSchema = {
    type: 'object',
    required: ['scientificName', 'genusId'],
    properties: {
        scientificName: { type: 'string' },
        japaneseName: { type: 'string', nullable: true },
        gbifTaxonKey: { type: 'number', nullable: true },
        edibility: { type: 'string', enum: edibilityEnum, nullable: true },
        genusId: { type: 'number' }
    }
}

export const updateSpeciesSchema = {
    type: 'object',
    properties: {
        scientificName: { type: 'string' },
        japaneseName: { type: 'string', nullable: true },
        gbifTaxonKey: { type: 'number', nullable: true },
        edibility: { type: 'string', enum: edibilityEnum, nullable: true },
        genusId: { type: 'number' },
        deletedAt: { type: 'string', format: 'date-time', nullable: true }
    }
}
