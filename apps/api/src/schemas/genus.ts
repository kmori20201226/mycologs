export const genusSchema = {
    type: 'object',
    properties: {
        id: { type: 'number' },
        scientificName: { type: 'string' },
        japaneseName: { type: 'string', nullable: true },
        familyId: { type: 'number' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        family: {
            type: 'object',
            properties: {
                id: { type: 'number' },
                scientificName: { type: 'string' },
                japaneseName: { type: 'string', nullable: true }
            }
        }
    }
}

export const createGenusSchema = {
    type: 'object',
    required: ['scientificName', 'familyId'],
    properties: {
        scientificName: { type: 'string' },
        japaneseName: { type: 'string', nullable: true },
        familyId: { type: 'number' }
    }
}

export const updateGenusSchema = {
    type: 'object',
    properties: {
        scientificName: { type: 'string' },
        japaneseName: { type: 'string', nullable: true },
        familyId: { type: 'number' }
    }
}
