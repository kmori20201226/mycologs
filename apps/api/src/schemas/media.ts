export const mediaSchema = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        filename: { type: 'string' },
        originalName: { type: 'string' },
        url: { type: 'string' },
        type: { type: 'string', enum: ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT'] },
        mimeType: { type: 'string' },
        size: { type: 'number' },
        duration: { type: 'number', nullable: true },
        width: { type: 'number', nullable: true },
        height: { type: 'number', nullable: true },
        postId: { type: 'number' },
        thumbnailUrl: { type: 'string', nullable: true },
        isPublic: { type: 'boolean' },
        description: { type: 'string', nullable: true },
        tags: { type: 'array', items: { type: 'string' } },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        deletedAt: { type: 'string', format: 'date-time', nullable: true },
        post: {
            type: 'object',
            properties: {
                id: { type: 'number' },
                contents: { type: 'string' }
            }
        }
    }
}

export const createMediaSchema = {
    type: 'object',
    required: ['filename', 'originalName', 'url', 'type', 'mimeType', 'size', 'postId'],
    properties: {
        filename: { type: 'string' },
        originalName: { type: 'string' },
        url: { type: 'string' },
        type: { type: 'string', enum: ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT'] },
        mimeType: { type: 'string' },
        size: { type: 'number' },
        duration: { type: 'number' },
        width: { type: 'number' },
        height: { type: 'number' },
        postId: { type: 'number' },
        thumbnailUrl: { type: 'string' },
        isPublic: { type: 'boolean' },
        description: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } }
    }
}

export const updateMediaSchema = {
    type: 'object',
    properties: {
        description: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        isPublic: { type: 'boolean' }
    }
}