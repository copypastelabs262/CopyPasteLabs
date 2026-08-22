"use client";

import { useCallback, useState } from "react";
import LectureRunner from "./LectureRunner";
import LectureLibrary from "./LectureLibrary";

// Owns only the one piece of state the two sections share: a counter the
// library watches so a freshly processed lecture appears without a reload.
export default function LabConsole() {
  const [refreshKey, setRefreshKey] = useState(0);
  const handleRunCompleted = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="space-y-14">
      <LectureRunner onRunCompleted={handleRunCompleted} />
      <LectureLibrary refreshKey={refreshKey} />
    </div>
  );
}
