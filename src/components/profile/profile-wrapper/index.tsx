"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, User } from "lucide-react";
import { useCartActions, useProfileManagement } from "@/hooks";
import { GradientButton } from "@/components/ui/custom";
import { AnimatedBackground } from "@/components/ui/animated-background";
import { MainHeader } from "@/components/main-header";
import { Skeleton } from "@/components/ui/skeleton";
import { DataCard } from "@/components/data-card";
import { Addresses } from "@/components/profile/addresses";
import { OrderHistory } from "@/components/profile/order-history";
import { PersonalInformation } from "@/components/profile/personal-information";
import { Security } from "@/components/profile/security";
import { UserPhotoUpload } from "@/components/user-photo-upload";

function ProfileShell({
  cartItems,
  children,
}: {
  cartItems: number;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <AnimatedBackground
      showBlobs={false}
      className="min-h-screen bg-muted py-0"
    >
      <MainHeader
        cartItems={cartItems}
        onCartClick={() => router.push("/cart")}
        showSearch={false}
        showLocation
        showCart
        showOrders
        showNotifications
      />
      {children}
    </AnimatedBackground>
  );
}

export function ProfileWrapper() {
  const router = useRouter();
  const { totalItems } = useCartActions();
  const {
    // Auth & Loading
    user,
    isMounted,
    isAuthenticated,
    hasHydrated,
    isLoadingProfile,
    profileError,
    // Profile
    profileForm,
    editingState,
    updateProfile,
    handleSaveProfile,
    handleCancelEdit,
    handleUpdatePhoto,
    // Addresses
    addresses,
    isLoadingAddresses,
    addressForm,
    addingAddressState,
    isSavingAddress,
    handleAddAddress,
    handleCloseAddressModal,
    handleDeleteAddress,
    handleEditAddress,
    handleSetDefaultAddress,
    settingDefaultAddressId,
    editingAddressId,
    addressCoords,
    applyCoords,
    neighborhoodOptions,
    isLocatingPin,
    stateOptions,
    cityOptions,
    isLoadingCities,
    citiesError,
    fieldLocks,
    changeState,
    changeCity,
    changeNeighborhood,
    isOtherNeighborhood,
    selectOtherNeighborhood,
    changeOtherNeighborhood,
    isSearchingAddress,
    addressNotFound,
    pinZoom,
    pinRecenterKey,
    // CEP
    isLoadingCep,
  } = useProfileManagement();

  // Redirect if not authenticated - só depois que o Zustand persist hidratar
  // (lê a sessão do localStorage de forma assíncrona). Antes disso
  // isAuthenticated começa em `false` mesmo pra quem tá logado, então checar
  // sem esperar `hasHydrated` mandava usuário logado de volta pro login a
  // cada F5 em /profile.
  useEffect(() => {
    if (!hasHydrated) return;

    if (!isAuthenticated || !user) {
      router.push("/?openAuth=true");
    }
  }, [hasHydrated, isAuthenticated, user, router]);

  if (!isMounted || !hasHydrated) {
    return (
      <div className="min-h-screen bg-muted">
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  if (isLoadingProfile) {
    return (
      <div className="min-h-screen bg-muted">
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
          <div className="space-y-4">
            <Skeleton className="h-8 w-48 rounded-xl" />
            <Skeleton className="h-4 w-64 rounded-xl" />
          </div>
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (profileError) {
    return (
      <ProfileShell cartItems={totalItems}>
        <div className="flex min-h-[70vh] items-center justify-center pt-24">
          <div className="text-center max-w-md p-6">
            <div className="text-red-500 dark:text-red-400 text-6xl mb-4">
              ⚠️
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Erro ao Carregar Perfil
            </h2>
            <p className="text-muted-foreground mb-4">{profileError}</p>
            <GradientButton onClick={() => router.refresh()}>
              Tentar Novamente
            </GradientButton>
          </div>
        </div>
      </ProfileShell>
    );
  }

  return (
    <ProfileShell cartItems={totalItems}>
      <div className="max-w-4xl mx-auto px-4 pb-8 pt-24 space-y-8">
        {/* Título + voltar (mesmo padrão de /orders) */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground transition hover:border-border"
            aria-label="Voltar"
            title="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Meu Perfil</h1>
            <p className="text-muted-foreground">
              Gerencie suas informações pessoais
            </p>
          </div>
        </div>

        {/* Profile Picture */}
        <DataCard title="Foto de Perfil" icon={<User className="h-5 w-5" />}>
          <UserPhotoUpload
            value={user.photoUrl || ""}
            onChange={handleUpdatePhoto}
            userId={user.id}
            userData={{
              name: user.name,
              email: user.email,
              cpf: user.cpf,
              phone: user.phone,
            }}
            label="Alterar Foto"
            maxSizeMB={5}
          />
        </DataCard>

        {/* Personal Information */}
        <PersonalInformation
          handleSaveProfile={handleSaveProfile}
          handleCancelEdit={handleCancelEdit}
          updateProfile={updateProfile}
          editingState={editingState}
          profileForm={profileForm}
          user={user}
        />

        {/* Order History */}
        <OrderHistory />

        {/* Addresses */}
        <Addresses
          handleCloseAddressModal={handleCloseAddressModal}
          handleDeleteAddress={handleDeleteAddress}
          handleAddAddress={handleAddAddress}
          handleEditAddress={handleEditAddress}
          handleSetDefaultAddress={handleSetDefaultAddress}
          settingDefaultAddressId={settingDefaultAddressId}
          applyCoords={applyCoords}
          editingAddressId={editingAddressId}
          addingAddressState={addingAddressState}
          isLoadingAddresses={isLoadingAddresses}
          isSavingAddress={isSavingAddress}
          isLoadingCep={isLoadingCep}
          addressForm={addressForm}
          addressCoords={addressCoords}
          addresses={addresses}
          neighborhoodOptions={neighborhoodOptions}
          isLocatingPin={isLocatingPin}
          addressFieldProps={{
            stateOptions,
            cityOptions,
            isLoadingCities,
            citiesError,
            fieldLocks,
            onStateChange: changeState,
            onCityChange: changeCity,
            onNeighborhoodChange: changeNeighborhood,
            isOtherNeighborhood,
            onSelectOtherNeighborhood: selectOtherNeighborhood,
            onOtherNeighborhoodChange: changeOtherNeighborhood,
          }}
          pinStatusProps={{
            isSearchingAddress,
            addressNotFound,
            pinZoom,
            pinRecenterKey,
          }}
        />

        {/* Security */}
        <Security />
      </div>
    </ProfileShell>
  );
}
