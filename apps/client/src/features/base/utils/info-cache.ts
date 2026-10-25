import { QueryClient } from "@tanstack/react-query";
import {
  Base,
  BaseProperty,
  BaseView,
  BaseViewConfig,
  BaseViewConfigPatch,
} from "@/features/base/types/base.types";
import { baseKeys } from "@/features/base/queries/base-query-keys";

// Properties and views live inside the base info query. These helpers keep
// that cache consistent; each write is idempotent by id.

function upsertById<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx < 0) return [...list, item];
  const out = [...list];
  out[idx] = item;
  return out;
}

export function upsertPropertyInBase(base: Base, property: BaseProperty): Base {
  return { ...base, properties: upsertById(base.properties, property) };
}

export function removePropertyFromBase(base: Base, propertyId: string): Base {
  if (!base.properties.some((p) => p.id === propertyId)) return base;
  return {
    ...base,
    properties: base.properties.filter((p) => p.id !== propertyId),
  };
}

export function patchPropertyInBase(
  base: Base,
  propertyId: string,
  patch: Partial<BaseProperty>,
): Base {
  if (!base.properties.some((p) => p.id === propertyId)) return base;
  return {
    ...base,
    properties: base.properties.map((p) =>
      p.id === propertyId ? { ...p, ...patch } : p,
    ),
  };
}

export function upsertViewInBase(base: Base, view: BaseView): Base {
  return { ...base, views: upsertById(base.views, view) };
}

export function removeViewFromBase(base: Base, viewId: string): Base {
  if (!base.views.some((v) => v.id === viewId)) return base;
  return { ...base, views: base.views.filter((v) => v.id !== viewId) };
}

// Same merge as views/update: keys set to null are removed.
export function mergeViewConfig(
  config: BaseViewConfig,
  patch: BaseViewConfigPatch,
): BaseViewConfig {
  const out: Record<string, unknown> = { ...config };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else if (v !== undefined) out[k] = v;
  }
  return out as BaseViewConfig;
}

export function patchViewInBase(
  base: Base,
  viewId: string,
  patch: Partial<Omit<BaseView, "config">> & { config?: BaseViewConfigPatch },
): Base {
  if (!base.views.some((v) => v.id === viewId)) return base;
  const { config, ...rest } = patch;
  return {
    ...base,
    views: base.views.map((v) =>
      v.id === viewId
        ? {
            ...v,
            ...rest,
            config: config ? mergeViewConfig(v.config ?? {}, config) : v.config,
          }
        : v,
    ),
  };
}

export function updateBaseInfo(
  qc: QueryClient,
  pageId: string,
  fn: (base: Base) => Base,
) {
  const base = qc.getQueryData<Base>(baseKeys.info(pageId));
  if (!base) return;
  const next = fn(base);
  if (next !== base) qc.setQueryData(baseKeys.info(pageId), next);
}
