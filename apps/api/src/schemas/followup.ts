export const followupSchema = {
    type: 'object',
    properties: {
        id: { type: 'number' },
        parentPostId: { type: 'number' },
        userId: { type: 'number' },
        contents: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        user: {
            type: 'object',
            properties: {
                id: { type: 'number' },
                name: { type: 'string' },
                handleName: { type: 'string', nullable: true }
            }
        }
    }
}

export const createFollowupSchema = {
    type: 'object',
    required: ['parentPostId', 'userId', 'contents'],
    properties: {
        parentPostId: { type: 'number' },
        userId: { type: 'number' },
        contents: { type: 'string' }
    }
}

export const updateFollowupSchema = {
    type: 'object',
    properties: {
        contents: { type: 'string' }
    }
}
