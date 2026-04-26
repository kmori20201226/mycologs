export const paymentSchema = {
    type: 'object',
    properties: {
        id:             { type: 'string' },
        userId:         { type: 'integer', nullable: true },
        clubId:         { type: 'integer', nullable: true },
        subscriptionId: { type: 'string', nullable: true },
        amount:         { type: 'integer' },
        currency:       { type: 'string' },
        status:         { type: 'string' },
        provider:       { type: 'string' },
        providerRef:    { type: 'string', nullable: true },
        paidAt:         { type: 'string', format: 'date-time', nullable: true },
        createdAt:      { type: 'string', format: 'date-time' },
    }
}

export const createPaymentSchema = {
    type: 'object',
    required: ['amount', 'currency', 'status', 'provider'],
    properties: {
        userId:         { type: 'integer' },
        clubId:         { type: 'integer' },
        subscriptionId: { type: 'string' },
        amount:         { type: 'integer' },
        currency:       { type: 'string' },
        status:         { type: 'string', enum: ['paid', 'failed', 'refunded'] },
        provider:       { type: 'string' },
        providerRef:    { type: 'string' },
        paidAt:         { type: 'string', format: 'date-time' },
    }
}
