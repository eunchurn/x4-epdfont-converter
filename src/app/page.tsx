"use client";

import { Suspense, lazy } from "react";

const FontConverter = lazy(() => import("@/components/FontConverter"));

function LoadingSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="animate-spin h-10 w-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-600 dark:text-gray-400">Loading converter...</p>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8">
      <Suspense fallback={<LoadingSpinner />}>
        <FontConverter />
      </Suspense>
    </div>
  );
}
