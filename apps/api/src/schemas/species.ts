export const speciesSchema = {
    type: 'object',
    properties: {
        id: { type: 'number' },
        name: { type: 'string' },
        genusId: { type: 'number' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        deletedAt: { type: 'string', format: 'date-time', nullable: true },
        genus: {
            type: 'object',
            properties: {
                id: { type: 'number' },
                name: { type: 'string' }
            }
        }
    }
}

export const createSpeciesSchema = {
    type: 'object',
    required: ['name', 'genusId'],
    properties: {
        name: { type: 'string' },
        genusId: { type: 'number' }
    }
}

export const updateSpeciesSchema = {
    type: 'object',
    properties: {
        name: { type: 'string' },
        genusId: { type: 'number' }
    }
}