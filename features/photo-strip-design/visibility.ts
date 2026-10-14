import { requiresPhotoStripDesign } from "../business-core/catalog/service.catalog.ts";

type PhotoStripDocumentLike = {
  documentType?: string | null;
  document_type?: string | null;
};

/**
 * A registered photo-strip design is durable evidence that the event uses the
 * workflow, even when an older/custom service code is no longer in the catalog.
 */
export function shouldShowPhotoStripDesignCenter(
  serviceCodes: readonly string[],
  documents: readonly PhotoStripDocumentLike[] = [],
) {
  return requiresPhotoStripDesign(serviceCodes) || documents.some((document) =>
    (document.documentType ?? document.document_type) === "PHOTO_STRIP_DESIGN",
  );
}
