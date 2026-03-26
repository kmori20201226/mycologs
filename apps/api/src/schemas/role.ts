export const roleSchema = {
    type: 'object',
    properties: {
        id: { type: 'number' },
        name: { type: 'string', enum: ['ADMIN', 'DEVELOPER', 'MODERATOR', 'CLUBMEMBER'] },
        createdAt: { type: 'string', format: 'date-time' }
    }
}

export const createRoleSchema = {
    type: 'object',
    required: ['name'],
    properties: {
        name: { type: 'string', enum: ['ADMIN', 'DEVELOPER', 'MODERATOR', 'CLUBMEMBER'] }
    }
}
