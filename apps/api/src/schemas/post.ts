export const postSchema = {
    type: 'object',
    properties: {
        id: { type: 'number' },
        eventId: { type: 'number', nullable: true },
        userId: { type: 'number' },
        contents: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        user: {
            type: 'object',
            properties: {
                id: { type: 'number' },
                name: { type: 'string' },
                email: { type: 'string' }
            }
        },
        event: {
            type: 'object',
            nullable: true,
            properties: {
                id: { type: 'number' },
                name: { type: 'string' }
            }
        }
    }
}

export const createPostSchema = {
    type: 'object',
    required: ['userId', 'contents'],
    properties: {
        eventId: { type: 'number' },
        userId: { type: 'number' },
        contents: { type: 'string' }
    }
}

export const updatePostSchema = {
    type: 'object',
    properties: {
        eventId: { type: 'number' },
        contents: { type: 'string' }
    }
}