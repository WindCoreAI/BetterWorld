import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import ProblemSection from "@/components/ProblemSection";
import HowItWorks from "@/components/HowItWorks";
import Audiences from "@/components/Audiences";
import Domains from "@/components/Domains";
import Guardrails from "@/components/Guardrails";
import ImpactCounters from "@/components/ImpactCounters";
import Technology from "@/components/Technology";
import Comparison from "@/components/Comparison";
import Vision from "@/components/Vision";
import WaitlistForm from "@/components/WaitlistForm";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main>
      <Navbar />
      <Hero />
      <ProblemSection />
      <HowItWorks />
      <Audiences />
      <Domains />
      <Guardrails />
      <ImpactCounters />
      <Technology />
      <Comparison />
      <Vision />
      <WaitlistForm />
      <Footer />
    </main>
  );
}
