import { useEffect, useRef, useState } from "react";
import SignaturePadLib from "signature_pad";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RotateCcw, Check } from "lucide-react";

interface SignaturePadProps {
  onSave: (signatureData: string, signatureType: 'drawn' | 'typed' | 'uploaded') => void;
  onCancel: () => void;
  /** What the confirm button says. The procurement portal names the decision. */
  submitLabel?: string;
  /** Rendered above the buttons — the "keep this signature" tick, for one. */
  extra?: React.ReactNode;
  /** Dropped inside a dialog, the surrounding Card is one border too many. */
  bare?: boolean;
}

export const SignaturePad = ({
  onSave,
  onCancel,
  submitLabel = "Sign Document",
  extra,
  bare = false,
}: SignaturePadProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const signaturePadRef = useRef<SignaturePadLib | null>(null);
  const [typedName, setTypedName] = useState("");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);

  /**
   * One pad per mounted canvas, torn down with it.
   *
   * The previous version guarded on `!signaturePadRef.current` and never reset
   * the ref, which is fine for a pad that lives on a page and fatal for one
   * inside a dialog: Radix unmounts its content on close, so reopening produced
   * a fresh <canvas> while the ref still held a pad bound to the detached one.
   * Every stroke went to a canvas nobody could see, and because the wrapper is
   * `bg-white` the dead pad still looked like a working one.
   *
   * Sizing is driven by ResizeObserver rather than the window's resize event.
   * A dialog animates in, so the canvas can measure zero on the first frame —
   * a one-shot measurement at mount is a race the observer simply does not have.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const pad = new SignaturePadLib(canvas, {
      backgroundColor: "rgb(255, 255, 255)",
      penColor: "rgb(0, 0, 0)",
    });
    signaturePadRef.current = pad;

    const fit = () => {
      const { width, height } = canvas.getBoundingClientRect();
      // Not laid out yet. The observer fires again once it is.
      if (!width || !height) return;

      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      // Setting width/height wipes the bitmap and resets the context, so the
      // strokes are taken out and put back rather than lost to a resize.
      const drawn = pad.toData();
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
      pad.clear();
      if (drawn.length) pad.fromData(drawn);
    };

    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      pad.off();
      signaturePadRef.current = null;
    };
  }, []);

  const handleClear = () => {
    signaturePadRef.current?.clear();
  };

  const handleSaveDrawn = () => {
    if (signaturePadRef.current && !signaturePadRef.current.isEmpty()) {
      const dataUrl = signaturePadRef.current.toDataURL();
      onSave(dataUrl, 'drawn');
    }
  };

  const handleSaveTyped = () => {
    if (!typedName.trim()) return;

    // Create a canvas to render the typed signature
    const canvas = document.createElement("canvas");
    canvas.width = 400;
    canvas.height = 150;
    const ctx = canvas.getContext("2d");
    
    if (ctx) {
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Same stack as the .font-script class the preview uses, so what is saved
      // is what was shown. Dancing Script is not bundled and this product runs
      // offline, so in practice both fall back to the platform's cursive face —
      // matching each other is what matters, not which face wins.
      ctx.font = "48px 'Dancing Script', cursive";
      ctx.fillStyle = "black";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(typedName, canvas.width / 2, canvas.height / 2);
      
      const dataUrl = canvas.toDataURL();
      onSave(dataUrl, 'typed');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setUploadedImage(dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveUploaded = () => {
    if (uploadedImage) {
      onSave(uploadedImage, 'uploaded');
    }
  };

  const body = (
    <Tabs defaultValue="draw" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="draw">Draw</TabsTrigger>
          <TabsTrigger value="type">Type</TabsTrigger>
          <TabsTrigger value="upload">Upload</TabsTrigger>
        </TabsList>

        <TabsContent value="draw" className="space-y-4">
          {/* Ink on paper, white in both themes on purpose: the PNG this
              produces is shown back on a white plate and dropped into printed
              documents, so a signature drawn on a dark ground would invert. */}
          <div className="relative overflow-hidden rounded-lg border border-border bg-white">
            <canvas
              ref={canvasRef}
              className="relative z-10 w-full touch-none"
              style={{ height: "200px" }}
            />
            {/* Above the canvas, not behind it: clear() fills the bitmap with
                opaque white, so anything underneath is invisible. Drawn here
                rather than onto the canvas so the guide never ends up baked
                into the saved signature. pointer-events-none keeps the pen
                reaching the canvas through them. */}
            <span className="pointer-events-none absolute inset-x-6 bottom-9 z-20 border-b border-dashed border-black/15" />
            <span className="pointer-events-none absolute inset-x-0 bottom-3 z-20 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-black/40">
              sign above the line
            </span>
          </div>
          {extra}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={handleClear}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Clear
            </Button>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSaveDrawn}>
              <Check className="h-4 w-4 mr-2" />
              {submitLabel}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="type" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="typed-name">Type your full name</Label>
            <Input
              id="typed-name"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder="Your full name"
              className="font-script text-2xl"
            />
          </div>
          {typedName && (
            // text-black, not the inherited foreground: on the dark theme that
            // is near-white, which put white ink on white paper.
            <div className="rounded-lg border border-border bg-white p-8 text-center">
              <p className="font-script text-5xl text-black">{typedName}</p>
            </div>
          )}
          {extra}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSaveTyped} disabled={!typedName.trim()}>
              <Check className="h-4 w-4 mr-2" />
              {submitLabel}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="upload" className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="signature-upload">Upload signature image</Label>
            <Input
              id="signature-upload"
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
            />
          </div>
          {uploadedImage && (
            <div className="rounded-lg border border-border bg-white p-4 text-center">
              <img
                src={uploadedImage}
                alt="Uploaded signature"
                className="max-h-32 mx-auto"
              />
            </div>
          )}
          {extra}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSaveUploaded} disabled={!uploadedImage}>
              <Check className="h-4 w-4 mr-2" />
              {submitLabel}
            </Button>
          </div>
        </TabsContent>
    </Tabs>
  );

  return bare ? body : <Card className="p-6">{body}</Card>;
};
