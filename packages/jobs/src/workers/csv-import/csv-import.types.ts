export interface CsvImportData {
  huntSessionId: string;
  userId: string;
  teamId?: string | null;
  csvContent: string;
}
