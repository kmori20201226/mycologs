export const familySchema = {
    type: 'object',
    properties: {
        id: { type: 'number' },
        scientificName: { type: 'string' },
        japaneseName: { type: 'string', nullable: true },
        shapeId: { type: 'number' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        shape: {
            type: 'object',
            properties: {
                id: { type: 'number' },
                name: { type: 'string' },
                japaneseName: { type: 'string', nullable: true }
            }
        }
    }
}

export const createFamilySchema = {
    type: 'object',
    required: ['scientificName', 'shapeId'],
    properties: {
        scientificName: { type: 'string' },
        japaneseName: { type: 'string', nullable: true },
        shapeId: { type: 'number' }
    }
}

export const updateFamilySchema = {
    type: 'object',
    properties: {
        scientificName: { type: 'string' },
        japaneseName: { type: 'string', nullable: true },
        shapeId: { type: 'number' }
    }
}
