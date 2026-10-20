import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  PersonalSpaceController,
  personalSpaceSlug,
} from './personal-space.controller';

const SLUG_RULE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
const user = { id: 'u1', name: 'Ann Lee' } as any;
const enabled = { id: 'ws', settings: { spaces: { allowPersonal: true } } };

function controller(existing?: any) {
  const spaceService = {
    createSpace: jest.fn(
      async (_u: any, _w: any, dto: any, _trx?: any, _opts?: any) => ({
        id: 's1',
        ...dto,
      }),
    ),
  };
  const spaceRepo = {
    findPersonalSpace: jest.fn().mockResolvedValue(existing),
  };
  const spaceMemberRepo = {
    getUserSpaceRoles: jest.fn().mockResolvedValue([{ role: 'admin' }]),
  };
  return {
    ctrl: new PersonalSpaceController(
      spaceService as any,
      spaceRepo as any,
      spaceMemberRepo as any,
    ),
    spaceService,
  };
}

describe('personalSpaceSlug', () => {
  it.each([
    ['Ann Lee', /^ann-lee-[a-z0-9]{6}$/],
    ['Không gian của Đức', /^khong-gian-cua-duc-[a-z0-9]{6}$/],
    ['!!!', /^personal-[a-z0-9]{6}$/],
    ['--x--', /^x-[a-z0-9]{6}$/],
  ])('%s', (name, pattern) => {
    const slug = personalSpaceSlug(name);
    expect(slug).toMatch(pattern);
    expect(slug).toMatch(SLUG_RULE);
  });

  it('stays within the slug length limit', () => {
    expect(personalSpaceSlug('a'.repeat(100)).length).toBeLessThanOrEqual(47);
  });
});

describe('PersonalSpaceController', () => {
  it('creates a personal space for the user', async () => {
    const { ctrl, spaceService } = controller();

    await ctrl.create({}, user, enabled as any);

    const [, wsId, dto, trx, options] = spaceService.createSpace.mock.calls[0];
    expect(wsId).toBe('ws');
    expect(dto.name).toBe("Ann's space");
    expect(dto.slug).toMatch(SLUG_RULE);
    expect(trx).toBeUndefined();
    expect(options).toEqual({ isPersonal: true });
  });

  it('refuses when the workspace setting is off', async () => {
    const { ctrl, spaceService } = controller();

    await expect(
      ctrl.create({ name: 'Mine' }, user, { id: 'ws', settings: null } as any),
    ).rejects.toThrow(ForbiddenException);
    expect(spaceService.createSpace).not.toHaveBeenCalled();
  });

  it('allows only one personal space', async () => {
    const { ctrl } = controller({ id: 'existing' });

    await expect(
      ctrl.create({ name: 'Mine' }, user, enabled as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('maps a concurrent duplicate to a clear error', async () => {
    const { ctrl, spaceService } = controller();
    spaceService.createSpace.mockRejectedValueOnce(
      new Error('duplicate key violates "spaces_personal_creator_unique"'),
    );

    await expect(
      ctrl.create({ name: 'Mine' }, user, enabled as any),
    ).rejects.toThrow('You already have a personal space');
  });

  it('returns null or the space with the membership', async () => {
    expect(await controller().ctrl.info(user, enabled as any)).toBeNull();
    expect(
      await controller({ id: 's1', isPersonal: true }).ctrl.info(
        user,
        enabled as any,
      ),
    ).toMatchObject({ id: 's1', membership: { userId: 'u1', role: 'admin' } });
  });
});
