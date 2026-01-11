import { BadRequestException } from '@nestjs/common';
import { ZodSchema, ZodError } from 'zod';

export async function parseBody<T>(schema: ZodSchema<T>, body: unknown): Promise<T> {
    try {
        return schema.parse(body);
    } catch (error) {
        if (error instanceof ZodError) {
            const messages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
            throw new BadRequestException(messages.join('; '));
        }
        throw error;
    }
}
