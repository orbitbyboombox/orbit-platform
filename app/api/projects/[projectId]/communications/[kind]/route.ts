import { getDigitalPhotoDeliveryPreviewAction } from "@/features/projects/communications/digital-photo-delivery.actions";
import { getPreEventReminderPreviewAction } from "@/features/projects/communications/pre-event-reminder.actions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string; kind: string }> },
) {
  const { projectId, kind } = await params;
  const headers = { "Cache-Control": "private, no-store" };
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(projectId)) {
    return Response.json({ ok: false, error: "El Evento no es válido." }, { status: 400, headers });
  }

  switch (kind) {
    case "photos":
      return Response.json(await getDigitalPhotoDeliveryPreviewAction(projectId), { headers });
    case "reminder":
      return Response.json(await getPreEventReminderPreviewAction(projectId), { headers });
    default:
      return Response.json({ ok: false, error: "Comunicación no disponible." }, { status: 404, headers });
  }
}
