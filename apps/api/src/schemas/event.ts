export const eventSchema = {
    type: 'object',
    properties: {
        id: { type: 'number' },
        name: { type: 'string' },
        description: { type: 'string', nullable: true },
        startAt: { type: 'string', format: 'date-time', nullable: true },
        endAt: { type: 'string', format: 'date-time', nullable: true },
        createdAt: { type: 'string', format: 'date-time' }
    }
}

export const createEventSchema = {
    type: 'object',
    required: ['name'],
    properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        startAt: { type: 'string', format: 'date-time' },
        endAt: { type: 'string', format: 'date-time' }
    }
}

export const updateEventSchema = {
    type: 'object',
    properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        startAt: { type: 'string', format: 'date-time' },
        endAt: { type: 'string', format: 'date-time' }
    }
}