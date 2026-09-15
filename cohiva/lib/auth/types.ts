export type CohivaUser = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  username: string | null;
  imageUrl: string;
  avatarIcon: string;
};

export type CohivaAuthState = {
  user: CohivaUser | null;
  isLoaded: boolean;
  isSignedIn: boolean;
};
