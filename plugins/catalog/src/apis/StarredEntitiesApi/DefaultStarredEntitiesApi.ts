/*
 * Copyright 2021 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { StorageApi } from '@backstage/core-plugin-api';
import { StarredEntitiesApi } from '@backstage/plugin-catalog-react';
import { Observable } from '@backstage/types';
import ObservableImpl from 'zen-observable';
import { performMigrationToTheNewBucket } from './migration';

/**
 * Default implementation of the StarredEntitiesApi that is backed by the StorageApi.
 *
 * @public
 */
export class DefaultStarredEntitiesApi implements StarredEntitiesApi {
  private readonly settingsStore: StorageApi;
  private starredEntities: Set<string>;

  constructor(opts: { storageApi: StorageApi }) {
    // no need to await. The updated content will be caught by the observe$
    performMigrationToTheNewBucket(opts).then();

    this.settingsStore = opts.storageApi.forBucket('starredEntities');

    this.starredEntities = new Set(
      this.settingsStore.snapshot<string[]>('entityRefs').value ?? [],
    );

    this.settingsStore.observe$<string[]>('entityRefs').subscribe({
      next: next => {
        this.starredEntities = new Set(next.value ?? []);
        this.notifyChanges();
      },
    });
  }

  async toggleStarred(entityRef: string): Promise<void> {
    if (this.starredEntities.has(entityRef)) {
      this.starredEntities.delete(entityRef);
    } else {
      this.starredEntities.add(entityRef);
    }

    await this.settingsStore.set(
      'entityRefs',
      Array.from(this.starredEntities),
    );
  }

  starredEntitie$(): Observable<Set<string>> {
    return this.observable;
  }

  private readonly subscribers = new Set<
    ZenObservable.SubscriptionObserver<Set<string>>
  >();

  private readonly observable = new ObservableImpl<Set<string>>(subscriber => {
    // forward the latest value
    subscriber.next(new Set(this.starredEntities));

    this.subscribers.add(subscriber);
    return () => {
      this.subscribers.delete(subscriber);
    };
  });

  private notifyChanges() {
    for (const subscription of this.subscribers) {
      subscription.next(new Set(this.starredEntities));
    }
  }
}
