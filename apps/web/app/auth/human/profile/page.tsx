"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button, Card, CardBody, Combobox } from "../../../../src/components/ui";
import {
  CITIES_BY_COUNTRY,
  COUNTRIES,
  SKILL_SUGGESTIONS,
} from "../../../../src/constants/profile-options";
import { useHumanAuth } from "../../../../src/hooks/useHumanAuth";
import { profileApi } from "../../../../src/lib/humanApi";
import type { ProfileInput } from "../../../../src/types/human";

const COMMON_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "zh", label: "Chinese" },
  { code: "ar", label: "Arabic" },
  { code: "pt", label: "Portuguese" },
  { code: "ru", label: "Russian" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "hi", label: "Hindi" },
  { code: "it", label: "Italian" },
  { code: "nl", label: "Dutch" },
  { code: "sv", label: "Swedish" },
  { code: "tr", label: "Turkish" },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const WEEKENDS = ["Sat", "Sun"];

/* eslint-disable max-lines-per-function, complexity */
export default function ProfilePage() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useHumanAuth();

  const [isEditMode, setIsEditMode] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [skillDropdownOpen, setSkillDropdownOpen] = useState(false);
  const skillContainerRef = useRef<HTMLDivElement>(null);
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [languages, setLanguages] = useState<string[]>(["en"]);
  const [bio, setBio] = useState("");
  const [selectedWeekdays, setSelectedWeekdays] = useState<string[]>([]);
  const [selectedWeekends, setSelectedWeekends] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Fetch existing profile to determine create vs edit mode
  useEffect(() => {
    if (!isAuthenticated) return;

    let cancelled = false;
    (async () => {
      const res = await profileApi.get();
      if (cancelled) return;

      if (res.ok && res.data) {
        const p = res.data;
        setIsEditMode(true);
        setSkills(p.skills ?? []);
        setCity(p.city ?? "");
        setCountry(p.country ?? "");
        setLanguages(p.languages?.length ? p.languages : ["en"]);
        setBio(p.bio ?? "");

        const avail = p.availability as { weekdays?: string[]; weekends?: string[] } | null;
        if (avail) {
          setSelectedWeekdays(avail.weekdays ?? []);
          setSelectedWeekends(avail.weekends ?? []);
        }
      }
      setInitialLoading(false);
    })();

    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // Skill suggestions filtered by input, excluding already-added skills
  const filteredSkillSuggestions = useMemo(() => {
    if (!skillInput.trim()) return [];
    const q = skillInput.toLowerCase();
    return SKILL_SUGGESTIONS.filter(
      (s) => s.toLowerCase().includes(q) && !skills.includes(s),
    ).slice(0, 8);
  }, [skillInput, skills]);

  // City options based on selected country
  const cityOptions = useMemo(
    () => CITIES_BY_COUNTRY[country] ?? [],
    [country],
  );

  const addSkill = useCallback(
    (value?: string) => {
      const trimmed = (value ?? skillInput).trim();
      if (trimmed && !skills.includes(trimmed) && skills.length < 50) {
        setSkills((prev) => [...prev, trimmed]);
        setSkillInput("");
        setSkillDropdownOpen(false);
      }
    },
    [skillInput, skills],
  );

  const removeSkill = (skill: string) => {
    setSkills(skills.filter((s) => s !== skill));
  };

  const toggleLanguage = (code: string) => {
    setLanguages((prev) =>
      prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code],
    );
  };

  const toggleDay = (day: string, isWeekend: boolean) => {
    const setter = isWeekend ? setSelectedWeekends : setSelectedWeekdays;
    setter((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const handleCountryChange = useCallback(
    (value: string) => {
      setCountry(value);
      // Clear city when country changes so user picks a valid city
      if (value !== country) setCity("");
    },
    [country],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (skills.length === 0) {
      setError("Add at least one skill");
      return;
    }
    if (!city.trim() || !country.trim()) {
      setError("City and country are required");
      return;
    }
    if (languages.length === 0) {
      setError("Select at least one language");
      return;
    }

    setLoading(true);

    const data: ProfileInput = {
      skills,
      city: city.trim(),
      country: country.trim(),
      languages,
    };

    if (bio.trim()) data.bio = bio.trim();
    if (selectedWeekdays.length > 0 || selectedWeekends.length > 0) {
      data.availability = {
        weekdays: selectedWeekdays,
        weekends: selectedWeekends,
      };
    }

    const res = isEditMode
      ? await profileApi.update(data)
      : await profileApi.create(data);
    setLoading(false);

    if (res.ok) {
      if (isEditMode) {
        router.push("/dashboard");
      } else {
        router.push("/onboarding");
      }
    } else {
      setError(res.error?.message ?? "Failed to save profile");
    }
  };

  if (authLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-charcoal-light">Loading...</p>
      </main>
    );
  }

  if (!isAuthenticated) {
    router.push("/auth/human/login");
    return null;
  }

  if (initialLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-terracotta border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="max-w-2xl mx-auto">
        {isEditMode && (
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-sm text-charcoal-light hover:text-charcoal mb-4"
          >
            &larr; Back to dashboard
          </Link>
        )}
        <h1 className="text-3xl font-bold text-charcoal mb-2">
          {isEditMode ? "Edit Your Profile" : "Complete Your Profile"}
        </h1>
        <p className="text-charcoal-light mb-8">
          {isEditMode
            ? "Update your information to improve mission matching"
            : "Tell us about yourself so we can match you with the right missions"}
        </p>

        <Card>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Skills with autocomplete */}
              <div>
                <label className="block text-sm font-medium text-charcoal mb-1.5">
                  Skills <span className="text-red-500">*</span>
                </label>
                <div ref={skillContainerRef} className="relative">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Type to search skills or add your own..."
                      value={skillInput}
                      onChange={(e) => {
                        setSkillInput(e.target.value);
                        setSkillDropdownOpen(true);
                      }}
                      onFocus={() => { if (skillInput) setSkillDropdownOpen(true); }}
                      onBlur={() => {
                        setTimeout(() => {
                          if (!skillContainerRef.current?.contains(document.activeElement)) {
                            setSkillDropdownOpen(false);
                          }
                        }, 150);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addSkill();
                        }
                      }}
                      className="flex-1 h-10 px-3 bg-cream border border-charcoal/20 rounded-lg shadow-neu-inset text-charcoal placeholder:text-charcoal/40 focus:border-terracotta focus:ring-2 focus:ring-terracotta/20 outline-none transition-all duration-150"
                    />
                    <Button type="button" onClick={() => addSkill()} variant="secondary" size="md">
                      Add
                    </Button>
                  </div>

                  {/* Skill suggestions dropdown */}
                  {skillDropdownOpen && filteredSkillSuggestions.length > 0 && (
                    <ul className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-charcoal/15 rounded-lg shadow-lg">
                      {filteredSkillSuggestions.map((suggestion) => (
                        <li
                          key={suggestion}
                          className="px-3 py-2 text-sm text-charcoal cursor-pointer hover:bg-charcoal/5 transition-colors"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            addSkill(suggestion);
                          }}
                        >
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <p className="text-xs text-charcoal-light mt-1.5">
                  {skills.length}/50 skills &middot; Press Enter or click Add for custom skills
                </p>

                {skills.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {skills.map((skill) => (
                      <span
                        key={skill}
                        className="inline-flex items-center gap-1 px-3 py-1 bg-terracotta/10 text-terracotta rounded-full text-sm"
                      >
                        {skill}
                        <button
                          type="button"
                          onClick={() => removeSkill(skill)}
                          className="hover:text-terracotta-dark"
                          aria-label={`Remove ${skill}`}
                        >
                          &times;
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Location — Country then City */}
              <div className="grid grid-cols-2 gap-4">
                <Combobox
                  label="Country"
                  value={country}
                  onChange={handleCountryChange}
                  options={[...COUNTRIES]}
                  placeholder="Search country..."
                  required
                  allowCustom
                />
                <Combobox
                  label="City"
                  value={city}
                  onChange={setCity}
                  options={cityOptions}
                  placeholder={country ? "Search city..." : "Select country first"}
                  required
                  allowCustom
                />
              </div>

              {/* Languages */}
              <div>
                <label className="block text-sm font-medium text-charcoal mb-2">
                  Languages <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {COMMON_LANGUAGES.map(({ code, label }) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => toggleLanguage(code)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                        languages.includes(code)
                          ? "bg-terracotta text-cream"
                          : "bg-charcoal/5 text-charcoal-light hover:bg-charcoal/10"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bio */}
              <div>
                <label className="block text-sm font-medium text-charcoal mb-2">
                  Bio
                </label>
                <textarea
                  placeholder="Tell us about yourself and your motivation..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={500}
                  rows={3}
                  className="w-full px-3 py-2 border border-charcoal/20 rounded-lg focus:border-terracotta focus:ring-2 focus:ring-terracotta/20 outline-none transition-colors resize-none"
                />
                <p className="text-xs text-charcoal-light mt-1">
                  {bio.length}/500 characters
                </p>
              </div>

              {/* Availability */}
              <div>
                <label className="block text-sm font-medium text-charcoal mb-2">
                  Availability
                </label>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-charcoal-light mb-1">Weekdays</p>
                    <div className="flex gap-2">
                      {WEEKDAYS.map((day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day, false)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            selectedWeekdays.includes(day)
                              ? "bg-terracotta text-cream"
                              : "bg-charcoal/5 text-charcoal-light hover:bg-charcoal/10"
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-charcoal-light mb-1">Weekends</p>
                    <div className="flex gap-2">
                      {WEEKENDS.map((day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day, true)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                            selectedWeekends.includes(day)
                              ? "bg-terracotta text-cream"
                              : "bg-charcoal/5 text-charcoal-light hover:bg-charcoal/10"
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-error/10 text-error text-sm">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                loading={loading}
                disabled={loading}
              >
                {loading
                  ? (isEditMode ? "Saving changes..." : "Creating profile...")
                  : (isEditMode ? "Save Changes" : "Create Profile & Continue")}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
