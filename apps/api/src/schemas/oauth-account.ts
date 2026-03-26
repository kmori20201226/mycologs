export const oauthAccountSchema = {
    type: 'object',
    properties: {
        id: { type: 'string' },
        userId: { type: 'number' },
        provider: { type: 'string' },
        providerAccountId: { type: 'string' },
        accessToken: { type: ['string', 'null'] },
        refreshToken: { type: ['string', 'null'] },
        expiresAt: { type: ['number', 'null'] },
        tokenType: { type: ['string', 'null'] },
        scope: { type: ['string', 'null'] },
        idToken: { type: ['string', 'null'] },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' }
    }
}

export const createOAuthAccountSchema = {
    type: 'object',
    required: ['userId', 'provider', 'providerAccountId'],
    properties: {
        userId: { type: 'number' },
        provider: { type: 'string' },
        providerAccountId: { type: 'string' },
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        expiresAt: { type: 'number' },
        tokenType: { type: 'string' },
        scope: { type: 'string' },
        idToken: { type: 'string' }
    }
}
