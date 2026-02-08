/**
 * @arch archcodex.test.fixture
 *
 * Fixture: makeAuthMutation wrapper for inferrer tests.
 */
import { ConvexError } from 'convex/values';

// Stub types for fixture
type Id<T extends string> = string & { __tableName: T };
interface Ctx {
  db: {
    insert: (table: string, data: unknown) => Promise<unknown>;
    patch: (id: unknown, data: unknown) => Promise<void>;
    delete: (id: unknown) => Promise<void>;
  };
  userId: string;
}

function makeAuthMutation(handler: (ctx: Ctx, args: Record<string, unknown>) => Promise<unknown>) {
  return handler;
}

function logAudit(ctx: Ctx, entry: Record<string, unknown>) {
  void ctx;
  void entry;
}

export const create = makeAuthMutation(
  async (ctx, args: { url: string; title?: string }) => {
    const _id = await ctx.db.insert('products', {
      url: args.url,
      title: args.title ?? '',
      userId: ctx.userId,
    });

    await logAudit(ctx, {
      userId: ctx.userId,
      action: 'product.create',
      resourceType: 'product',
      resourceId: String(_id),
    });

    return { _id };
  },
);
