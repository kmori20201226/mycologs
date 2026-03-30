export const shapeSchema = {
    type: 'object',
    properties: {
        id: { type: 'number' },
        name: { type: 'string' },
        japaneseName: { type: 'string', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' }
    }
}

export const createShapeSchema = {
    type: 'object',
    required: ['name'],
    properties: {
        name: { type: 'string' },
        japaneseName: { type: 'string', nullable: true }
    }
}

export const updateShapeSchema = {
    type: 'object',
    properties: {
        name: { type: 'string' },
        japaneseName: { type: 'string', nullable: true }
    }
}
