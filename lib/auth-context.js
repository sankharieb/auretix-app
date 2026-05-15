import {
  getSupabaseUser,
  getSupabaseUserFromAccessToken,
  isSupabaseConfigured,
} from "./supabase/server.js";

const rolePermissions = {
  owner: {
    canReadWorkspace: true,
    canManageWorkspace: true,
    canRunDecisions: true,
    canManageUsers: true,
  },
  admin: {
    canReadWorkspace: true,
    canManageWorkspace: true,
    canRunDecisions: true,
    canManageUsers: true,
  },
  operator: {
    canReadWorkspace: true,
    canManageWorkspace: true,
    canRunDecisions: true,
    canManageUsers: false,
  },
  finance: {
    canReadWorkspace: true,
    canManageWorkspace: false,
    canRunDecisions: true,
    canManageUsers: false,
  },
  viewer: {
    canReadWorkspace: true,
    canManageWorkspace: false,
    canRunDecisions: false,
    canManageUsers: false,
  },
  anonymous: {
    canReadWorkspace: false,
    canManageWorkspace: false,
    canRunDecisions: false,
    canManageUsers: false,
  },
};

export const demoAuthContext = {
  mode: "demo",
  authenticated: true,
  role: "owner",
  company: {
    id: "company_demo",
    name: "Demo Operating Company",
    slug: "demo",
  },
  user: {
    id: "user_demo_owner",
    authUserId: null,
    companyId: "company_demo",
    name: "Demo Owner",
    email: "owner@example.com",
    role: "owner",
  },
  permissions: rolePermissions.owner,
};

function normalizeRole(role) {
  return rolePermissions[role] ? role : "viewer";
}

function buildSupabaseContext(user) {
  const role = normalizeRole(user.user_metadata?.role || "owner");
  const companyId = user.user_metadata?.company_id || `company_${user.id}`;
  const companyName = user.user_metadata?.company_name || "Auretix workspace";

  return {
    mode: "supabase",
    authenticated: true,
    role,
    company: {
      id: companyId,
      name: companyName,
      slug:
        user.user_metadata?.company_slug ||
        companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    },
    user: {
      id: `user_${user.id}`,
      authUserId: user.id,
      companyId,
      name:
        user.user_metadata?.name ||
        user.user_metadata?.full_name ||
        user.email ||
        "Auretix user",
      email: user.email,
      role,
    },
    permissions: rolePermissions[role],
  };
}

function getBearerToken(request) {
  const header = request?.headers?.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  return match ? match[1] : null;
}

export async function getRequestContext(request = null) {
  if (!isSupabaseConfigured()) {
    return demoAuthContext;
  }

  const user = await getSupabaseUser();

  if (user) {
    return buildSupabaseContext(user);
  }

  const bearerUser = await getSupabaseUserFromAccessToken(getBearerToken(request));

  if (!bearerUser) {
    return {
      mode: "supabase",
      authenticated: false,
      role: "anonymous",
      company: null,
      user: null,
      permissions: rolePermissions.anonymous,
    };
  }

  return buildSupabaseContext(bearerUser);
}

export function canReadWorkspace(context) {
  return Boolean(context?.permissions?.canReadWorkspace);
}

export function canManageWorkspace(context) {
  return Boolean(context?.permissions?.canManageWorkspace);
}

export function canRunDecisions(context) {
  return Boolean(context?.permissions?.canRunDecisions);
}
