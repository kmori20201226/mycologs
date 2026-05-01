export const clubSchema = {
    type: 'object',
    properties: {
        id:           { type: 'number' },
        name:         { type: 'string' },
        introduction: { type: ['string', 'null'] },
        policy:       { type: ['string', 'null'] },
        status:       { type: 'string' },
        createdAt:    { type: 'string', format: 'date-time' }
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
        name:         { type: 'string' },
        introduction: { type: ['string', 'null'] },
        policy:       { type: ['string', 'null'] }
    }
}
