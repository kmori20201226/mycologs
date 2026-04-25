export const identificationSchema = {
    type: 'object',
    properties: {
        id: { type: 'number' },
        postId: { type: 'number' },
        userId: { type: 'number' },
        specieId: { type: 'number' },
        identificationHint: { type: 'string', nullable: true },
        description: { type: 'object', nullable: true, additionalProperties: true },
        accepted: { type: 'boolean' },
        confidence: { type: 'number', nullable: true },
        score: { type: 'number', nullable: true },
        deletedAt: { type: 'string', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        user: {
            type: 'object',
            properties: {
                id: { type: 'number' },
                name: { type: 'string' },
                handleName: { type: 'string', nullable: true }
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
                scientificName: { type: 'string' }
            }
        }
    }
}

export const createIdentificationSchema = {
    type: 'object',
    required: ['postId', 'userId'],
    properties: {
        postId: { type: 'number' },
        userId: { type: 'number' },
        specieId: { type: 'number', nullable: true },
        identificationHint: { type: 'string', nullable: true },
        score: { type: 'number', nullable: true },
        description: { type: 'object', nullable: true, additionalProperties: true }
    }
}

export const updateIdentificationSchema = {
    type: 'object',
    properties: {
        specieId: { type: 'number' }
    }
}