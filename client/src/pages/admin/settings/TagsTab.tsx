/**
 * Onglet Tags & Labels : tags alimentaires et certifications activés
 * pour le restaurant (sauvegardés via le bouton Enregistrer global).
 */
import { useState, useEffect } from 'react';
import { publicApi, DietaryTagCategory, CertificationCategory } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { DynamicIcon as Icon } from 'lucide-react/dynamic';
import type { IconName } from 'lucide-react/dynamic';
import type { SettingsState } from './useSettingsState';

export function TagsTab({ state }: { state: SettingsState }) {
    const { enabledTags, setEnabledTags, enabledCerts, setEnabledCerts } = state;

    const [tagCategories, setTagCategories] = useState<DietaryTagCategory[]>([]);
    const [certCategories, setCertCategories] = useState<CertificationCategory[]>([]);

    useEffect(() => {
        publicApi.getTaxonomy()
            .then((taxonomy) => {
                setTagCategories(taxonomy.dietary_tag_categories || []);
                setCertCategories(taxonomy.certification_categories || []);
            })
            .catch(() => {});
    }, []);

    const toggleTag = (tagId: string) => {
        setEnabledTags(prev => prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]);
    };
    const toggleCert = (certId: string) => {
        setEnabledCerts(prev => prev.includes(certId) ? prev.filter(c => c !== certId) : [...prev, certId]);
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Tags alimentaires</CardTitle>
                    <CardDescription>Activez les régimes alimentaires que vous souhaitez pouvoir indiquer</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {tagCategories.map(cat => (
                        <div key={cat.id}>
                            <p className="text-sm font-medium text-muted-foreground mb-2">{cat.name}</p>
                            <div className="flex flex-wrap gap-2">
                                {cat.tags.map(tag => (
                                    <button
                                        key={tag.id}
                                        onClick={() => toggleTag(tag.id)}
                                        className={`px-4 py-2 rounded-lg border-2 transition-all flex items-center gap-2 ${
                                            enabledTags.includes(tag.id)
                                                ? 'border-green-500 bg-green-500/10 text-green-600 dark:text-green-400'
                                                : 'border-border text-muted-foreground hover:border-muted-foreground'
                                        }`}
                                    >
                                        <Icon name={tag.icon as IconName} className="w-4 h-4" />
                                        <span>{tag.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                    {tagCategories.length === 0 && <p className="text-sm text-muted-foreground italic">Chargement des tags…</p>}
                </CardContent>
            </Card>

            {/* Certifications */}
            <Card>
                <CardHeader>
                    <CardTitle>Certifications et labels</CardTitle>
                    <CardDescription>Activez les certifications officielles que vous souhaitez pouvoir afficher</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {certCategories.map(cat => (
                        <div key={cat.id}>
                            <p className="text-sm font-medium text-muted-foreground mb-3">{cat.name}</p>
                            <div className="grid gap-2 sm:grid-cols-2">
                                {cat.certifications.map(cert => {
                                    const isActive = enabledCerts.includes(cert.id);
                                    return (
                                        <button
                                            key={cert.id}
                                            onClick={() => toggleCert(cert.id)}
                                            className={`w-full text-left px-3 py-2.5 rounded-lg border-2 transition-all flex items-start gap-3 ${
                                                isActive
                                                    ? 'border-blue-500 bg-blue-500/10'
                                                    : 'border-border hover:border-muted-foreground'
                                            }`}
                                        >
                                            <img src={`/certifications/${cert.logo_filename}`} alt={cert.name} className="w-8 h-8 object-contain shrink-0 mt-0.5" />
                                            <div className="min-w-0 flex-1">
                                                <p className={`text-sm font-medium leading-tight ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-foreground'}`}>
                                                    {cert.official_name}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{cert.guarantee}</p>
                                                <p className="text-[11px] text-muted-foreground/70 mt-0.5 break-words">{cert.issuer}</p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                    {certCategories.length === 0 && <p className="text-sm text-muted-foreground italic">Chargement des certifications…</p>}
                </CardContent>
            </Card>
        </>
    );
}
