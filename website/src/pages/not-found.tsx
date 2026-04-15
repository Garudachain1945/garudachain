import { Layout } from "@/components/Layout";
import { Link } from "wouter";
import { useI18n } from "@/lib/i18n";
import { FileQuestion, Home } from "lucide-react";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <Layout>
      <div className="container mx-auto px-4 py-32 flex flex-col items-center justify-center text-center">
        <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-8 border-4 border-white shadow-xl">
          <FileQuestion className="w-12 h-12 text-muted-foreground" />
        </div>

        <h1 className="text-6xl font-black mb-4">404</h1>
        <h2 className="text-2xl font-bold text-muted-foreground mb-8">{t("notfound.title")}</h2>

        <p className="text-muted-foreground max-w-md mx-auto mb-10">
          {t("notfound.desc")}
        </p>

        <Link
          href="/"
          className="inline-flex items-center gap-2 px-8 py-4 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-lg shadow-primary/25 hover:-translate-y-1 transition-all"
        >
          <Home className="w-5 h-5" />
          {t("notfound.back")}
        </Link>
      </div>
    </Layout>
  );
}
