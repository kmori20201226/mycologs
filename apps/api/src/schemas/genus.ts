export const genusSchema = {
    type: 'object',
    properties: {
        id: { type: 'number' },
        name: { type: 'string' },
        familyId: { type: 'number' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        family: {
            type: 'object',
            properties: {
                id: { type: 'number' },
                name: { type: 'string' }
            }
        }
    }
}

export const createGenusSchema = {
    type: 'object',
    required: ['name', 'familyId'],
    properties: {
        name: { type: 'string' },
        familyId: { type: 'number' }
    }
}

export const updateGenusSchema = {
    type: 'object',
    properties: {
        name: { type: 'string' },
        familyId: { type: 'number' }
    }
}