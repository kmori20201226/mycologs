export const familySchema = {
    type: 'object',
    properties: {
        id: { type: 'number' },
        name: { type: 'string' },
        shapeId: { type: 'number' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        shape: {
            type: 'object',
            properties: {
                id: { type: 'number' },
                name: { type: 'string' }
            }
        }
    }
}

export const createFamilySchema = {
    type: 'object',
    required: ['name', 'shapeId'],
    properties: {
        name: { type: 'string' },
        shapeId: { type: 'number' }
    }
}

export const updateFamilySchema = {
    type: 'object',
    properties: {
        name: { type: 'string' },
        shapeId: { type: 'number' }
    }
}