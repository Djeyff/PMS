/**
 * pnpm >=9 introduces approve-builds to block lifecycle scripts unless approved.
 * This file allows esbuild and its platform subpackages to run their install scripts.
 */
export const allowedBuilds = [
  "esbuild",
  "@esbuild/android-arm",
  "@esbuild/android-arm64",
  "@esbuild/android-x64",
  "@esbuild/darwin-arm64",
  "@esbuild/darwin-x64",
  "@esbuild/freebsd-arm64",
  "@esbuild/freebsd-x64",
  "@esbuild/linux-arm",
  "@esbuild/linux-arm64",
  "@esbuild/linux-ia32",
  "@esbuild/linux-loong64",
  "@esbuild/linux-mips64el",
  "@esbuild/linux-ppc64",
  "@esbuild/linux-riscv64",
  "@esbuild/linux-s390x",
  "@esbuild/linux-x64",
  "@esbuild/netbsd-x64",
  "@esbuild/openbsd-x64",
  "@esbuild/sunos-x64",
  "@esbuild/win32-arm64",
  "@esbuild/win32-ia32",
  "@esbuild/win32-x64"
];