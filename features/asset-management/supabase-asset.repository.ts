import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssignAssetInput, OperationalAsset } from "./types";

interface AssetRow { id: string; asset_code: string; asset_type: OperationalAsset["assetType"]; status: OperationalAsset["status"]; usage_counter: number; qr_key: string; }

export class SupabaseAssetRepository {
  constructor(private readonly client: SupabaseClient) {}
  async list(): Promise<readonly OperationalAsset[]> {
    const { data, error } = await this.client.from("operational_assets").select("id,asset_code,asset_type,status,usage_counter,qr_key").is("deleted_at", null).order("asset_code");
    if (error) throw error;
    return (data as AssetRow[]).map((row) => ({ id: row.id, assetCode: row.asset_code, assetType: row.asset_type, status: row.status, usageCounter: row.usage_counter, qrKey: row.qr_key }));
  }
  async assign(input: AssignAssetInput): Promise<void> {
    void input.orbitEventId;
    const { error } = await this.client.rpc("assign_operational_asset", { p_project_id: input.projectId, p_asset_id: input.assetId, p_reason: input.reason });
    if (error) throw error;
  }
  async release(assignmentId: string, reason: string): Promise<void> { const { error } = await this.client.rpc("release_operational_asset", { p_assignment_id: assignmentId, p_reason: reason }); if (error) throw error; }
}
