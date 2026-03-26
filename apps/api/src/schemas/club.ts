export const clubSchema = {
    type: 'object',
    properties: {
        id: { type: 'number' },
        name: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' }
    }
}

export const createClubSchema = {
    type: 'object',
    required: ['name'],
    properties: {
        name: { type: 'string' }
    }
}

export const updateClubSchema = {
    type: 'object',
    properties: {
        name: { type: 'string' }
    }
}
