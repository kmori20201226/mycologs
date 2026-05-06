export const planSchema = {
    type: 'object',
    properties: {
        id:         { type: 'string' },
        name:       { type: 'string' },
        maxMembers:       { type: 'integer' },
        priceYen:         { type: 'integer' },
        creditsPerPeriod: { type: 'integer' },
        active:           { type: 'boolean' },
        sortOrder:  { type: 'integer' },
        createdAt:  { type: 'string' },
        updatedAt:  { type: 'string' },
    }
}
