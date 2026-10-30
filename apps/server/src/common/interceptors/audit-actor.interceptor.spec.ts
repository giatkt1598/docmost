import { of } from 'rxjs';
import { ClsService } from 'nestjs-cls';
import { AuditActorInterceptor } from './audit-actor.interceptor';
import { JwtType } from '../../core/auth/dto/jwt-payload';

function run(authType?: string) {
  const context: Record<string, unknown> = { actorType: 'user' };
  const cls = { get: () => context, set: jest.fn() };
  const execution = {
    switchToHttp: () => ({
      getRequest: () => ({ user: { user: { id: 'user-1' }, authType } }),
    }),
  };

  new AuditActorInterceptor(cls as unknown as ClsService).intercept(
    execution as any,
    { handle: () => of(null) },
  );
  return context;
}

describe('AuditActorInterceptor', () => {
  it('keeps a browser session as a user', () => {
    const context = run(JwtType.ACCESS);
    expect(context).toMatchObject({ actorId: 'user-1', actorType: 'user' });
    expect(context.credential).toBeUndefined();
  });

  it.each([JwtType.API_KEY, JwtType.OAUTH_ACCESS, 'mcp_token'])(
    'marks %s as automation',
    (authType) => {
      expect(run(authType)).toMatchObject({
        actorId: 'user-1',
        actorType: 'api_key',
        credential: authType,
      });
    },
  );
});
