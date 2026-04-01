export const eventSchema = {
    type: 'object',
    properties: {
        id: { type: 'number' },
        clubId: { type: 'number', nullable: true },
        name: { type: 'string' },
        description: { type: 'string', nullable: true },
        place: { type: 'string', nullable: true },
        longitude: { type: 'number', nullable: true },
        latitude: { type: 'number', nullable: true },
        startAt: { type: 'string', format: 'date-time', nullable: true },
        endAt: { type: 'string', format: 'date-time', nullable: true },
        createdAt: { type: 'string', format: 'date-time' }
    }
}

export const createEventSchema = {
    type: 'object',
    required: ['name'],
    properties: {
        clubId: { type: 'number', nullable: true },
        name: { type: 'string' },
        description: { type: 'string' },
        place: { type: 'string' },
        longitude: { type: 'number' },
        latitude: { type: 'number' },
        startAt: { type: 'string', format: 'date-time' },
        endAt: { type: 'string', format: 'date-time' }
    }
}

export const updateEventSchema = {
    type: 'object',
    properties: {
        clubId: { type: 'number', nullable: true },
        name: { type: 'string' },
        description: { type: 'string' },
        place: { type: 'string', nullable: true },
        longitude: { type: 'number', nullable: true },
        latitude: { type: 'number', nullable: true },
        startAt: { type: 'string', format: 'date-time' },
        endAt: { type: 'string', format: 'date-time' }
    }
}
