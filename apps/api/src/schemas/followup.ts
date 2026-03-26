export const followupSchema = {
    type: 'object',
    properties: {
        id: { type: 'number' },
        postId: { type: 'number' },
        userId: { type: 'number', nullable: true },
        contents: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        user: {
            type: 'object',
            nullable: true,
            properties: {
                id: { type: 'number' },
                name: { type: 'string' }
            }
        },
        post: {
            type: 'object',
            properties: {
                id: { type: 'number' },
                contents: { type: 'string' }
            }
        }
    }
}

export const createFollowupSchema = {
    type: 'object',
    required: ['postId', 'contents'],
    properties: {
        postId: { type: 'number' },
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