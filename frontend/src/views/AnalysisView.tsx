/**
 * Analysis view component
 * Handles all analysis queries as specified in the UI requirements
 */

import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import MissingDatesView from "./MissingDatesView";
import DuplicatesView from "./DuplicatesView";
import DailyEntriesView from "./DailyEntriesView";
import KnownEntitiesView from "./KnownEntitiesView";

const AnalysisView: React.FC = () => {
  return (
    <div className="space-y-6">
      <Routes>
        <Route path="/" element={<Navigate to="missing-dates" replace />} />
        <Route path="missing-dates" element={<MissingDatesView />} />
        <Route path="duplicates" element={<DuplicatesView />} />
        <Route path="daily-entries" element={<DailyEntriesView />} />
        <Route path="known-entities" element={<KnownEntitiesView />} />
        <Route path="*" element={<Navigate to="missing-dates" replace />} />
      </Routes>
    </div>
  );
};

export default AnalysisView;
