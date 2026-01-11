
"use client";

export interface MaterialsLoginModalProps {
    qrCodeBase64?: string;
    platform: string;
}

export const MaterialsLoginModalContent = ({ qrCodeBase64, platform }: MaterialsLoginModalProps) => {
    return (
        <div className="flex flex-col items-center justify-center py-6 gap-4">
            <p className="text-sm text-gray-400">
                Please open the {platform} app and scan the QR code to authorize.
            </p>
            {qrCodeBase64 ? (
                <div className="bg-white p-2 rounded-lg">
                    <img
                        src={`data:image/png;base64,${qrCodeBase64}`}
                        alt="Login QR Code"
                        width={200}
                        height={200}
                        className="object-contain" // Tailwind class
                    />
                </div>
            ) : (
                <div className="w-[200px] h-[200px] flex items-center justify-center bg-gray-800 rounded-lg">
                    <span className="text-xs text-gray-500">Waiting for QR Code...</span>
                </div>
            )}
            <p className="text-xs text-center text-gray-500">
                Cookies will be automatically stored securely after login.
                <br />The process will continue automatically.
            </p>
        </div>
    );
};
