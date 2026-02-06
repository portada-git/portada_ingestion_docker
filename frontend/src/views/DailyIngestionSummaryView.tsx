import React, { useState } from "react";
import { apiService } from "../services/api";
import PublicationSelector from "../components/PublicationSelector";
import LoadingSpinner from "../components/LoadingSpinner";
import { DailyIngestionSummaryEntry } from "../types";

export const DailyIngestionSummaryView: React.FC = () => {
  const [newspaper, setNewspaper] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [results, setResults] = useState<DailyIngestionSummaryEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newspaper) {
      setError("Please select a newspaper.");
      return;
    }
    setLoading(true);
    setError(null);
    setResults([]);
    try {
      const response = await apiService.getDailyIngestionSummary({
        newspaper,
        start_date: startDate,
        end_date: endDate,
      });
      setResults(response);
    } catch (err: any) {
      setError(err.message || "An error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const renderSummaryTree = (items: DailyIngestionSummaryEntry[]) => {
    const tree = items.map((item, index) => (
      <li key={index} style={{ marginLeft: getIndentation(item) }}>
        {item.label}: <strong>{item.count}</strong>
      </li>
    ));
    return <ul>{tree}</ul>;
  };

  const getIndentation = (item: DailyIngestionSummaryEntry) => {
    if (item.month === undefined) return "0px"; // Year or Total
    if (item.day === undefined) return "20px"; // Month
    if (item.edition === undefined) return "40px"; // Day
    return "60px"; // Edition
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Daily Ingestion Summary</h1>
      <form
        onSubmit={handleSubmit}
        className="mb-4 p-4 border rounded bg-gray-50"
      >
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-1">
            <label
              htmlFor="newspaper"
              className="block text-sm font-medium text-gray-700"
            >
              Newspaper
            </label>
            <PublicationSelector
              value={newspaper}
              onChange={setNewspaper}
            />
          </div>
          <div className="md:col-span-1">
            <label
              htmlFor="start_date"
              className="block text-sm font-medium text-gray-700"
            >
              Start Date
            </label>
            <input
              type="date"
              id="start_date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          <div className="md:col-span-1">
            <label
              htmlFor="end_date"
              className="block text-sm font-medium text-gray-700"
            >
              End Date
            </label>
            <input
              type="date"
              id="end_date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          <div className="md:col-span-1 flex items-end">
            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {loading ? <LoadingSpinner /> : "Get Summary"}
            </button>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </form>

      {loading && (
        <div className="flex justify-center">
          <LoadingSpinner />
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-6">
          <h2 className="text-xl font-semibold mb-2">Results</h2>
          <div className="p-4 border rounded bg-white">
            {renderSummaryTree(results)}
          </div>
        </div>
      )}
    </div>
  );
};
