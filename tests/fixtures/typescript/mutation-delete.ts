/**
 * @arch archcodex.test.fixture
 *
 * Fixture: mutation with ConvexError throws for inferrer tests.
 */

// Stub ConvexError
class ConvexError extends Error {
  constructor(public data: { code: string; message: string }) {
    super(data.message);
  }
}

interface Ctx {
  db: {
    get: (id: unknown) => Promise<unknown>;
    delete: (id: unknown) => Promise<void>;
  };
  userId: string;
}

function makeAuthMutation(handler: (ctx: Ctx, args: Record<string, unknown>) => Promise<unknown>) {
  return handler;
}

export const remove = makeAuthMutation(
  async (ctx, args: { id: string }) => {
    const item = await ctx.db.get(args.id);
    if (!item) {
      throw new ConvexError({ code: 'NOT_FOUND', message: 'Item not found' });
    }
    await ctx.db.delete(args.id);
    return { deleted: true };
  },
);
