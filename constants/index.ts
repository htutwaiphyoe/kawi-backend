export const COOKIES = {
  access: { name: "accessToken", path: "/" },
  refresh: { name: "refreshToken", path: "/auth" },
} as const;

export const BEARER_PREFIX = "Bearer ";

export const MINUTE = 60 * 1000;

export const DAY = 24 * 60 * 60 * 1000;
