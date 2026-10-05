import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-[#151E1A] group-[.toaster]:text-[#F1EEE3] group-[.toaster]:border-[#CFAB5C]/30 group-[.toaster]:shadow-2xl group-[.toaster]:font-sans",
          error: "group-[.toaster]:!border-[#FF5A64]/70 group-[.toaster]:!text-[#FF9CA3]",
          description: "group-[.toast]:text-[#F1EEE3]/70",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
