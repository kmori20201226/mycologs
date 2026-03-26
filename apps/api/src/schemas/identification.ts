export const identificationSchema = {
    type: 'object',
    properties: {
        id: { type: 'number' },
        postId: { type: 'number' },
        userId: { type: 'number' },
        specieId: { type: 'number' },
        confidence: { type: 'number', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        user: {
            type: 'object',
            properties: {
                id: { type: 'number' },
                name: { type: 'string' }
            }
        },
        post: {
            type: 'object',
            properties: {
                id: { type: 'number' },
                contents: { type: 'string' }
            }
        },
        species: {
            type: 'object',
            properties: {
                id: { type: 'number' },
                name: { type: 'string' }
            }
        }
    }
}

export const createIdentificationSchema = {
    type: 'object',
    required: ['postId', 'userId', 'specieId'],
    properties: {
        postId: { type: 'number' },
        userId: { type: 'number' },
        specieId: { type: 'number' }
    }
}

export const updateIdentificationSchema = {
    type: 'object',
    properties: {
        specieId: { type: 'number' }
    }
}