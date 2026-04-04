export const userRequestSchema = {
    type: 'object',
    properties: {
        id: { type: 'number' },
        requesterId: { type: 'number' },
        clubId: { type: 'number', nullable: true },
        request: { type: 'object', nullable: true, additionalProperties: true },
        reply: { type: 'object', nullable: true, additionalProperties: true },
        replierId: { type: 'number', nullable: true },
        accepted: { type: 'boolean', nullable: true },
        createdAt: { type: 'string', format: 'date-time' },
        repliedAt: { type: 'string', format: 'date-time', nullable: true },
        requester: {
            type: 'object',
            properties: {
                id: { type: 'number' },
                name: { type: 'string' },
                email: { type: 'string' }
            }
        },
        club: {
            type: 'object',
            nullable: true,
            properties: {
                id: { type: 'number' },
                name: { type: 'string' }
            }
        },
        replier: {
            type: 'object',
            nullable: true,
            properties: {
                id: { type: 'number' },
                name: { type: 'string' }
            }
        }
    }
}

export const createUserRequestSchema = {
    type: 'object',
    required: ['requesterId', 'clubId'],
    properties: {
        requesterId: { type: 'number' },
        clubId: { type: 'number' },
        request: { type: 'object', nullable: true, additionalProperties: true }
    }
}

export const replyUserRequestSchema = {
    type: 'object',
    required: ['replierId'],
    properties: {
        replierId: { type: 'number' },
        reply: { type: 'object', nullable: true, additionalProperties: true }
    }
}
