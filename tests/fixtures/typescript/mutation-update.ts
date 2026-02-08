/**
 * @arch archcodex.test.fixture
 *
 * Fixture: mutation with side effects for inferrer tests.
 */

// Stub types
interface Ctx {
  db: {
    get: (id: unknown) => Promise<unknown>;
    patch: (id: unknown, data: unknown) => Promise<void>;
  };
  userId: string;
}

function makeAuthMutation(handler: (ctx: Ctx, args: Record<string, unknown>) => Promise<unknown>) {
  return handler;
}

export const update = makeAuthMutation(
  async (ctx, args: { id: string; title: string }) => {
    const item = await ctx.db.get(args.id);
    if (!item) throw new Error('Not found');
    await ctx.db.patch(args.id, { title: args.title });
    return { success: true };
  },
);
