import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSiteRef } from '@/contexts/SiteContext';
import { getApiErrorMessage } from '@/lib/api/errors';
import { sitesApi, type Site, type SitePhoto } from '@/lib/api/sites';
import { imageFileProblem } from '@/lib/image-files';
import { linkProblem } from '@/lib/site-profile';
import { notify } from '@/lib/toast';
import { formOf, patchOf, type PublicPageForm } from './public-page-form';

type Media = 'logo' | 'cover';

interface Images {
  logo: string | null;
  cover: string | null;
  photos: SitePhoto[];
}

function imagesOf(site: Site): Images {
  return { logo: site.logo_url ?? null, cover: site.cover_url, photos: site.photos };
}

export function usePublicPageState() {
  const site = useSiteRef();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState<PublicPageForm | null>(null);
  const [form, setForm] = useState<PublicPageForm | null>(null);
  const [images, setImages] = useState<Images>({ logo: null, cover: null, photos: [] });
  const [busyMedia, setBusyMedia] = useState<Media | null>(null);
  const [showLinkProblems, setShowLinkProblems] = useState(false);

  const applySite = useCallback((own: Site) => {
    setForm(formOf(own));
    setSaved(formOf(own));
    setImages(imagesOf(own));
  }, []);

  useEffect(() => {
    sitesApi
      .getOwn(site)
      .then(applySite)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, [site, applySite]);

  const patch = useMemo(() => (form && saved ? patchOf(form, saved) : {}), [form, saved]);
  const hasChanges = Object.keys(patch).length > 0;
  const linkProblems = useMemo(() => (form ? form.links.map(linkProblem) : []), [form]);

  const update = useCallback((changes: Partial<PublicPageForm>) => {
    setForm((previous) => (previous ? { ...previous, ...changes } : previous));
  }, []);

  const save = useCallback(async () => {
    if (linkProblems.some(Boolean)) {
      setShowLinkProblems(true);
      notify.error("Corrigez les liens signalés avant d'enregistrer.");
      return;
    }
    setIsSaving(true);
    try {
      applySite(await sitesApi.update(site, patch));
      setShowLinkProblems(false);
      notify.success('Page publique enregistrée');
    } catch (error) {
      notify.error(getApiErrorMessage(error, "L'enregistrement a échoué. Réessayez."));
    } finally {
      setIsSaving(false);
    }
  }, [site, patch, linkProblems, applySite]);

  const putMedia = useCallback(
    async (media: Media, file: File) => {
      const problem = imageFileProblem(file);
      if (problem) {
        notify.error(problem);
        return;
      }
      setBusyMedia(media);
      try {
        const own = await sitesApi.putMedia(site, media, file);
        setImages((previous) => ({ ...previous, [media]: imagesOf(own)[media] }));
        notify.success(media === 'logo' ? 'Logo enregistré' : 'Photo de couverture enregistrée');
      } catch (error) {
        notify.error(getApiErrorMessage(error, "L'image n'a pas pu être envoyée."));
      } finally {
        setBusyMedia(null);
      }
    },
    [site]
  );

  const deleteMedia = useCallback(
    async (media: Media) => {
      setBusyMedia(media);
      try {
        await sitesApi.deleteMedia(site, media);
        setImages((previous) => ({ ...previous, [media]: null }));
      } catch (error) {
        notify.error(getApiErrorMessage(error, "L'image n'a pas pu être retirée."));
      } finally {
        setBusyMedia(null);
      }
    },
    [site]
  );

  /** Rejects with the API's error, for the dialog to show it. */
  const addPhoto = useCallback(
    async (file: File, alt: string) => {
      const photo = await sitesApi.addPhoto(site, file, alt);
      setImages((previous) => ({ ...previous, photos: [...previous.photos, photo] }));
    },
    [site]
  );

  const updatePhoto = useCallback(
    async (id: number, alt: string) => {
      const photo = await sitesApi.updatePhoto(site, id, alt);
      setImages((previous) => ({
        ...previous,
        photos: previous.photos.map((other) => (other.id === id ? photo : other)),
      }));
    },
    [site]
  );

  const deletePhoto = useCallback(
    async (id: number) => {
      try {
        await sitesApi.deletePhoto(site, id);
        setImages((previous) => ({
          ...previous,
          photos: previous.photos.filter((photo) => photo.id !== id),
        }));
      } catch (error) {
        notify.error(getApiErrorMessage(error, "La photo n'a pas pu être retirée."));
      }
    },
    [site]
  );

  const movePhoto = useCallback(
    async (index: number, step: -1 | 1) => {
      const ids = images.photos.map((photo) => photo.id as number);
      [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
      try {
        const photos = await sitesApi.orderPhotos(site, ids);
        setImages((previous) => ({ ...previous, photos }));
      } catch (error) {
        notify.error(getApiErrorMessage(error, "L'ordre n'a pas pu être enregistré."));
      }
    },
    [site, images.photos]
  );

  return {
    site,
    isLoading,
    isSaving,
    form,
    update,
    hasChanges,
    save,
    linkProblems,
    showLinkProblems,
    images,
    busyMedia,
    putMedia,
    deleteMedia,
    addPhoto,
    updatePhoto,
    deletePhoto,
    movePhoto,
  };
}

export type PublicPageState = ReturnType<typeof usePublicPageState>;
