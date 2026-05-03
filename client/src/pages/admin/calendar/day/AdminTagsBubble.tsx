import { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import api from '@/lib/api';
import type { DietaryTag, CertificationItem, MenuItem } from '@/lib/api';
import { Icon, type IconName } from '@/components/ui/icon-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { UseMenuEditorReturn } from './useMenuEditor';

interface AdminTagsBubbleProps {
    item: MenuItem;
    editor: UseMenuEditorReturn;
    canEdit: boolean;
}

interface Config {
    dietary_tags: DietaryTag[];
    certifications: CertificationItem[];
}

let cachedConfig: Config | null = null;

async function fetchConfig(): Promise<Config> {
    if (cachedConfig) return cachedConfig;
    const res = await api.get('/settings');
    const r = res.data.restaurant;
    cachedConfig = { dietary_tags: r.config?.dietary_tags ?? [], certifications: r.config?.certifications ?? [] };
    return cachedConfig!;
}

export function AdminTagsBubble({ item, editor, canEdit }: AdminTagsBubbleProps) {
    const [config, setConfig] = useState<Config>({ dietary_tags: [], certifications: [] });

    useEffect(() => {
        fetchConfig().then(setConfig).catch(() => {});
    }, []);

    const tags = item.tags ?? [];
    const certs = item.certifications ?? [];
    const currentTagIds = new Set(tags.map(t => t.id));
    const currentCertIds = new Set(certs.map(c => c.id));
    const hasBadges = tags.length > 0 || certs.length > 0;
    const hasAvailable = config.dietary_tags.length > 0 || config.certifications.length > 0;

    const toggleTag = (tag: DietaryTag) => {
        if (currentTagIds.has(tag.id)) {
            editor.updateItem(item.id!, { tags: tags.filter(t => t.id !== tag.id) });
        } else {
            editor.updateItem(item.id!, { tags: [...tags, tag] });
        }
    };

    const toggleCert = (cert: CertificationItem) => {
        if (currentCertIds.has(cert.id)) {
            editor.updateItem(item.id!, { certifications: certs.filter(c => c.id !== cert.id) });
        } else {
            editor.updateItem(item.id!, { certifications: [...certs, cert] });
        }
    };

    const removeTag = (tagId: string) => {
        editor.updateItem(item.id!, { tags: tags.filter(t => t.id !== tagId) });
    };
    const removeCert = (certId: string) => {
        editor.updateItem(item.id!, { certifications: certs.filter(c => c.id !== certId) });
    };

    if (!hasBadges && !canEdit) return null;

    return (
        <div className="absolute bottom-0 right-2 translate-y-1/3 z-20 bg-white dark:bg-card rounded-full border border-gray-200 dark:border-border shadow-sm flex items-center gap-1 px-1 py-1.5">
            {/* Tag icons */}
            {tags.map(tag => (
                <button
                    key={tag.id}
                    type="button"
                    title={tag.label}
                    onClick={canEdit ? () => removeTag(tag.id) : undefined}
                    disabled={!canEdit}
                    className="group relative flex items-center justify-center w-4 h-4 rounded-full"
                    style={{ backgroundColor: tag.color + '22' }}
                >
                    <Icon name={tag.icon as IconName} className="w-2.5 h-2.5" style={{ color: tag.color }} />
                    {canEdit && (
                        <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-red-500 rounded-full transition-opacity">
                            <X className="w-2 h-2 text-white" />
                        </span>
                    )}
                </button>
            ))}

            {/* Separator */}
            {tags.length > 0 && certs.length > 0 && (
                <span className="w-px h-3 bg-gray-200 dark:bg-border mx-0.5 shrink-0" />
            )}

            {/* Certification logos */}
            {certs.map(cert => (
                <button
                    key={cert.id}
                    type="button"
                    title={cert.name}
                    onClick={canEdit ? () => removeCert(cert.id) : undefined}
                    disabled={!canEdit}
                    className="group relative flex items-center justify-center w-4 h-4"
                >
                    <img
                        src={`/certifications/${cert.logo_filename}`}
                        alt={cert.name}
                        className="h-4 w-4 object-contain"
                    />
                    {canEdit && (
                        <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-red-500 rounded-full transition-opacity">
                            <X className="w-2 h-2 text-white" />
                        </span>
                    )}
                </button>
            ))}

            {/* Add button */}
            {canEdit && hasAvailable && (
                <Popover>
                    <PopoverTrigger asChild>
                        <button
                            type="button"
                            title="Ajouter un tag"
                            className="flex items-center justify-center w-4 h-4 rounded-full hover:bg-muted transition-colors"
                        >
                            <Plus className="w-3 h-3 text-muted-foreground" />
                        </button>
                    </PopoverTrigger>
                    <PopoverContent side="top" align="end" className="w-64 p-2 space-y-2">
                        {config.dietary_tags.length > 0 && (
                            <div>
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1.5">Tags alimentaires</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {config.dietary_tags.map(tag => {
                                        const selected = currentTagIds.has(tag.id);
                                        return (
                                            <button
                                                key={tag.id}
                                                type="button"
                                                onClick={() => toggleTag(tag)}
                                                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-full transition-all"
                                                style={selected
                                                    ? { backgroundColor: tag.color + '22', color: tag.color, border: `1px solid ${tag.color}88` }
                                                    : { backgroundColor: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' }
                                                }
                                            >
                                                <Icon name={tag.icon as IconName} className="w-3 h-3" style={{ color: selected ? tag.color : '#9CA3AF' }} />
                                                {tag.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {config.certifications.length > 0 && (
                            <div>
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1.5">Certifications</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {config.certifications.map(cert => {
                                        const selected = currentCertIds.has(cert.id);
                                        return (
                                            <button
                                                key={cert.id}
                                                type="button"
                                                onClick={() => toggleCert(cert)}
                                                className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full transition-all"
                                                style={selected
                                                    ? { backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))', border: '1px solid hsl(var(--primary) / 0.3)' }
                                                    : { backgroundColor: '#F3F4F6', color: '#6B7280', border: '1px solid #E5E7EB' }
                                                }
                                            >
                                                <img src={`/certifications/${cert.logo_filename}`} alt={cert.name} className="h-3.5 w-3.5 object-contain" />
                                                {cert.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
}
