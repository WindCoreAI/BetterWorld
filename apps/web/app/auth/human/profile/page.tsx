"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { Button, Card, CardBody, Input } from "../../../../src/components/ui";
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

export default function ProfileCreatePage() {
  const router = useRouter();
  const { isAuthenticated, loading: authLoading } = useHumanAuth();

  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [languages, setLanguages] = useState<string[]>(["en"]);
  const [bio, setBio] = useState("");
  const [selectedWeekdays, setSelectedWeekdays] = useState<string[]>([]);
  const [selectedWeekends, setSelectedWeekends] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const addSkill = useCallback(() => {
    const trimmed = skillInput.trim();
    if (trimmed && !skills.includes(trimmed) && skills.length < 50) {
      setSkills([...skills, trimmed]);
      setSkillInput("");
    }
  }, [skillInput, skills]);

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

    const res = await profileApi.create(data);
    setLoading(false);

    if (res.ok) {
      router.push("/onboarding");
    } else {
      setError(res.error?.message ?? "Failed to create profile");
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

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-charcoal mb-2">
          Complete Your Profile
        </h1>
        <p className="text-charcoal-light mb-8">
          Tell us about yourself so we can match you with the right missions
        </p>

        <Card>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Skills */}
              <div>
                <div className="flex gap-2 mb-2">
                  <Input
                    label="Skills *"
                    placeholder="Type a skill and press Enter"
                    value={skillInput}
                    onChange={(e) => setSkillInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addSkill();
                      }
                    }}
                  />
                  <Button type="button" onClick={addSkill} variant="secondary">
                    Add
                  </Button>
                </div>
                {skills.length > 0 && (
                  <div className="flex flex-wrap gap-2">
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

              {/* Location */}
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="City *"
                  placeholder="San Francisco"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                />
                <Input
                  label="Country *"
                  placeholder="United States"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  required
                />
              </div>

              {/* Languages */}
              <div>
                <label className="block text-sm font-medium text-charcoal mb-2">
                  Languages *
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
                {loading ? "Creating profile..." : "Create Profile & Continue"}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
